/**
 * Email Service
 * Handles sending email notifications for trade events using Nodemailer
 */

import nodemailer from 'nodemailer';
import { NotificationType } from './types';

// SMTP Configuration from environment variables
const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // Use TLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
};

const emailFrom = process.env.EMAIL_FROM || '"Leverage" <noreply@leverage.app>';
const appUrl = process.env.APP_URL || 'http://localhost:5173';

// Create transporter (lazy initialization)
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
    // Only create transporter if SMTP credentials are configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log('[Email] SMTP not configured - email sending disabled');
        return null;
    }

    if (!transporter) {
        transporter = nodemailer.createTransport(smtpConfig);
        console.log('[Email] Transporter created with host:', smtpConfig.host);
    }

    return transporter;
}

/**
 * Email template wrapper with branded header/footer
 */
function wrapEmailTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 24px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Leverage</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0 0; font-size: 14px;">Strategic Collectibles Trading</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
            ${content}
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">
                This email was sent by Leverage. You received this because you have an active trade.
            </p>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8;">
                © ${new Date().getFullYear()} Leverage. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate email content based on notification type
 */
function getEmailContent(
    type: NotificationType,
    otherUserName: string,
    tradeId: string
): { subject: string; html: string } {
    const viewTradeButton = `
        <a href="${appUrl}/trades?highlight=${tradeId}" 
           style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #6366f1); 
                  color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; 
                  font-weight: 600; font-size: 14px; margin-top: 20px; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
            View Trade →
        </a>
    `;

    let subject: string;
    let bodyContent: string;

    switch (type) {
        case NotificationType.TRADE_PROPOSED:
            subject = `📨 New Trade Proposal from ${otherUserName}`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">New Trade Proposal!</h2>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    <strong style="color: #3b82f6;">${otherUserName}</strong> wants to trade with you.
                </p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                    Review their offer and decide whether to accept, counter, or decline.
                </p>
                ${viewTradeButton}
            `;
            break;

        case NotificationType.ESCROW_FUNDED:
            subject = `💰 Payment Secured - ${otherUserName} Funded Escrow`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">Payment Received!</h2>
                <div style="background: linear-gradient(135deg, #dcfce7, #d1fae5); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="color: #166534; font-size: 14px; margin: 0; font-weight: 500;">
                        ✓ Funds are now held securely in escrow
                    </p>
                </div>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    <strong style="color: #3b82f6;">${otherUserName}</strong> has funded the escrow.
                </p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                    The money is secured and will be released once both parties confirm receipt of items.
                </p>
                ${viewTradeButton}
            `;
            break;

        case NotificationType.TRADE_COMPLETED:
            subject = `🎉 Trade Complete with ${otherUserName}!`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">Trade Completed!</h2>
                <div style="background: linear-gradient(135deg, #dbeafe, #e0e7ff); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="color: #1e40af; font-size: 14px; margin: 0; font-weight: 500;">
                        🎊 Congratulations on a successful trade!
                    </p>
                </div>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    Your trade with <strong style="color: #3b82f6;">${otherUserName}</strong> is now complete.
                </p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                    All items have been verified and payments have been released.
                </p>
                ${viewTradeButton}
            `;
            break;

        case NotificationType.TRADE_ACCEPTED:
            subject = `✅ ${otherUserName} Accepted Your Trade`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">Trade Accepted!</h2>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    <strong style="color: #3b82f6;">${otherUserName}</strong> accepted your trade proposal.
                </p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                    Next step: Fund the escrow to secure the trade.
                </p>
                ${viewTradeButton}
            `;
            break;

        case NotificationType.COUNTER_OFFER:
            subject = `🔄 Counter Offer from ${otherUserName}`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">Counter Offer Received</h2>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    <strong style="color: #3b82f6;">${otherUserName}</strong> sent a counter offer.
                </p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                    Review the updated terms and respond.
                </p>
                ${viewTradeButton}
            `;
            break;

        case NotificationType.DISPUTE_OPENED:
            subject = `⚠️ Dispute Opened on Trade with ${otherUserName}`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">Dispute Opened</h2>
                <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
                        ⚠️ Action may be required
                    </p>
                </div>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    <strong style="color: #3b82f6;">${otherUserName}</strong> opened a dispute on your trade.
                </p>
                <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 0;">
                    Please review the details and respond promptly.
                </p>
                ${viewTradeButton}
            `;
            break;

        default:
            subject = `📬 Trade Update from Leverage`;
            bodyContent = `
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 22px;">Trade Update</h2>
                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                    There's an update on your trade with <strong style="color: #3b82f6;">${otherUserName}</strong>.
                </p>
                ${viewTradeButton}
            `;
    }

    return {
        subject,
        html: wrapEmailTemplate(bodyContent),
    };
}

/**
 * Send an email
 */
export async function sendEmail(
    to: string,
    subject: string,
    html: string
): Promise<boolean> {
    const transport = getTransporter();

    if (!transport) {
        console.log('[Email] Skipping email - SMTP not configured');
        return false;
    }

    try {
        const info = await transport.sendMail({
            from: emailFrom,
            to,
            subject,
            html,
        });

        console.log(`[Email] Sent to ${to}: ${subject} (${info.messageId})`);
        return true;
    } catch (error) {
        console.error('[Email] Failed to send:', error);
        return false;
    }
}

/**
 * Send email notification for trade events
 * Only sends for high-priority event types
 */
export async function sendTradeEventEmail(
    recipientEmail: string | null,
    type: NotificationType,
    otherUserName: string,
    tradeId: string
): Promise<boolean> {
    // Skip if no email address
    if (!recipientEmail) {
        console.log('[Email] Skipping - no recipient email');
        return false;
    }

    // Only send emails for high-priority events
    const highPriorityEvents = [
        NotificationType.TRADE_PROPOSED,
        NotificationType.ESCROW_FUNDED,
        NotificationType.TRADE_COMPLETED,
        NotificationType.TRADE_ACCEPTED,
        NotificationType.COUNTER_OFFER,
        NotificationType.DISPUTE_OPENED,
    ];

    if (!highPriorityEvents.includes(type)) {
        console.log(`[Email] Skipping low-priority event: ${type}`);
        return false;
    }

    const { subject, html } = getEmailContent(type, otherUserName, tradeId);
    return sendEmail(recipientEmail, subject, html);
}

/**
 * Verify SMTP connection
 */
export async function verifyEmailConnection(): Promise<boolean> {
    const transport = getTransporter();

    if (!transport) {
        return false;
    }

    try {
        await transport.verify();
        console.log('[Email] SMTP connection verified successfully');
        return true;
    } catch (error) {
        console.error('[Email] SMTP connection failed:', error);
        return false;
    }
}
