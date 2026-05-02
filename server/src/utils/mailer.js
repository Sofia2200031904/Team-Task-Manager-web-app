const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter;

const isSmtpConfigured = () =>
  Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass && env.smtpFrom);

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    return { skipped: true };
  }

  const info = await activeTransporter.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
    html,
  });

  return { skipped: false, messageId: info.messageId };
};

module.exports = {
  isSmtpConfigured,
  sendEmail,
};
