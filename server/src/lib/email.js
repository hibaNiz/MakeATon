// Sends email if SMTP is configured; otherwise prints it to the terminal (works offline).
import nodemailer from 'nodemailer';

export async function sendEmail({ to, subject, text }) {
  if (!process.env.SMTP_HOST) {
    console.log(`\n📧 [email not configured — printing instead]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return { printed: true };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
  return { sent: true };
}
