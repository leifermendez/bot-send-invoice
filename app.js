/**
 * ⚡⚡⚡ DECLARAMOS LAS LIBRERIAS y CONSTANTES A USAR! ⚡⚡⚡
 */
require('dotenv').config()
const _async = require('async')
const fs = require('fs');
const express = require('express');
const ora = require('ora');
const chalk = require('chalk');
const ExcelJS = require('exceljs');
const qrcode = require('qrcode-terminal');
const qr = require('qr-image');
const { Client, MessageMedia } = require('whatsapp-web.js');
const app = express();
app.use(express.urlencoded({ extended: true }))
const SESSION_FILE_PATH = './session.json';
let client;
let sessionData;
let queueSend = []
const PORT = process.env.PORT || 9000

/**
 * Enviamos archivos multimedia a nuestro cliente
 * @param {*} number 
 * @param {*} fileName 
 */
const sendMedia = (number, fileName, text = null) => new Promise((resolve, reject) => {
    number = number.replace('@c.us', '');
    number = `${number}@c.us`
    const media = MessageMedia.fromFilePath(`./mediaSend/${fileName}`);
    const msg = client.sendMessage(number, media, { caption: text || null });
    resolve(msg)
})

/**
 * Enviamos un mensaje simple (texto) a nuestro cliente
 * @param {*} number 
 */
const sendMessage = (number = null, text = null) => new Promise((resolve, reject) => {
    number = number.replace('@c.us', '');
    number = `${number}@c.us`
    const message = text;
    const msg = client.sendMessage(number, message);
    console.log(`${chalk.red('⚡⚡⚡ Enviando mensajes....')}`);
    resolve(msg)
})

/**
 * Delay
 * @param {*} number 
 * @returns 
 */

const delay = (t) => {
    return new Promise(resolve => {
        setTimeout(resolve.bind(null), t);
    });

}
/**
 * Clear number
 */

const clearNumber = (number) => {
    number = number.replace('@c.us', '');
    number = `${number}`
    return number;
}

/**
 * Revisamos si tenemos credenciales guardadas para inciar sessio
 * este paso evita volver a escanear el QRCODE
 */
const withSession = () => {
    const spinner = ora(`Cargando ${chalk.yellow('Validando session con Whatsapp...')}`);
    sessionData = require(SESSION_FILE_PATH);
    spinner.start();
    client = new Client({
        session: sessionData,
        puppeteer: {
            args: [
                '--no-sandbox'
            ],
        }
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        spinner.stop();
        connectionReady();

    });



    client.on('auth_failure', () => {
        spinner.stop();
        console.log('** Error de autentificacion vuelve a generar el QRCODE (Debes Borrar el archivo session.json) **');
    })


    client.initialize();
}

/**
 * Generamos un QRCODE para iniciar sesion
 */
const withOutSession = () => {

    console.log(`${chalk.greenBright('🔴🔴 No tenemos session guardada, espera que se generar el QR CODE 🔴🔴')}`);

    client = new Client({
        puppeteer: {
            args: [
                '--no-sandbox'
            ],
        }
    });
    client.on('qr', qr => {
        qrcode.generate(qr, { small: true });
        generateImage(qr)
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        connectionReady();
    });

    client.on('auth_failure', () => {
        console.log('** Error de autentificacion vuelve a generar el QRCODE **');
    })


    client.on('authenticated', (session) => {
        // Guardamos credenciales de de session para usar luego
        sessionData = session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
            if (err) {
                console.log(err);
            }
        });
    });

    client.initialize();
}

const connectionReady = async () => {
    let secondDelay = 2000

    /** Leer CSV **/
    const customers = await handleExcel() || [];

    /** Enviamos a cada numero */

    let q = _async.queue(async ({ to, name, file }, callback) => {

        const resWs = await sendMessage(to, `Hola ${name}`)
        const getInfo = await resWs.getChat();
        secondDelay = getInfo.isReadOnly !== undefined ? 5000 : 2000;
        // await getInfo.fetchMessages({ 'limit': 300 })
        console.log(`Esperamos...`, secondDelay)
        await delay(secondDelay)
        callback();
    }, 1);

    customers.forEach((customer) => {
        q.push(customer, (err) => {
            console.log('finished processing foo');
        });
    })



}


const generateImage = (base64) => {
    let qr_svg = qr.image(base64, { type: 'svg', margin: 4 });
    qr_svg.pipe(require('fs').createWriteStream('qr-code.svg'));
    console.log(`${chalk.blueBright('⚡ Recuerda que el QR se actualiza cada minuto ⚡')}`);
    console.log(`${chalk.blueBright('⚡ Actualiza F5 el navegador para mantener el mejor QR⚡')}`);
    console.log('http://localhost:9000/qr');
}

const handleExcel = () => new Promise((resolve) => {

    let queue = [];
    const workbook = new ExcelJS.Workbook();
    workbook.csv.readFile('./csv/invoice-customers.csv')
        .then((worksheet) => {
            worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                if (rowNumber !== 1) {
                    const singleData = {
                        to: `${row.values[1]}`,
                        name: row.values[2],
                        file: row.values[3],
                    }
                    queue.push(singleData)
                }
            })

            resolve(queue)
        })
});


/**
 * Revisamos si existe archivo con credenciales!
 */
(fs.existsSync(SESSION_FILE_PATH)) ? withSession() : withOutSession();

/** QR Link */

app.get('/qr', (req, res) => {
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    fs.createReadStream(`./qr-code.svg`).pipe(res);
})

app.listen(PORT, () => {
    console.log('Server ready!');
})