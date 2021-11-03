const nodeMailer = require('nodemailer');
const log = require('./log');

log.info("lib email init");

// qq email
// const transporter = nodeMailer.createTransport({
//   service: process.env.EMAIL_SERVICE,
//   port: parseInt(process.env.EMAIL_PORT), // SMTP port
//   secureConnection: true, // 使用了 SSL
//   auth: {
//       user: process.env.EMAIL_FROM,
//       pass: process.env.EMAIL_AUTH_CODE,
//   }
// });

// 163 email
const transporter = nodeMailer.createTransport({
    host: process.env.EMAIL_SERVICE,
    port: parseInt(process.env.EMAIL_PORT),
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_AUTH_CODE,
    }
  });

// send mail with defined transport object
const sendMail = async (subject, content, from) => {
    log.error(`email: ${subject} : ${content}`);
    const mailOptions = {
        from: from, // sender address
        to: process.env.EMAIL_TO_NAME, // list of receivers
        subject: subject,
        html: `<b>${content}</b>`
    };

    const info = await transporter.sendMail(mailOptions);
    log.info('Message sent: %s', info.messageId);
};

const logAndSendMail = async (subject, content, isSend = true, from = process.env.EMAIL_FROM_NAME) => {
    log.error(subject + " : ", content);
    try {
        if (isSend) {
            await sendMail(subject, content, from);
        }
    } catch (e) {
        log.error(`send mail failed, sub = ${subject}, content = ${content}`, e);
    }
}

module.exports = logAndSendMail;
